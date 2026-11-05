import { getRobloxCallbackUrl, getRobloxReturnUrl } from '@/lib/dis/roblox-oauth-url';
import {
  getRobloxUserGroupRole,
  mapRobloxRoleToDis,
  RobloxGroupLookupError,
} from '@/lib/dis/roblox-roles';
import { NextRequest, NextResponse } from 'next/server';
import { AppwriteException, Client, Databases, ID, Users } from 'node-appwrite';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'jop_dis';

const serverClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);

const users = new Users(serverClient);
const databases = new Databases(serverClient);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieState = request.cookies.get('roblox_oauth_state')?.value;

  if (!code) {
    return NextResponse.redirect(getRobloxReturnUrl(request, '/dis/login?error=missing_code'));
  }

  if (!state || state !== cookieState) {
    return NextResponse.redirect(getRobloxReturnUrl(request, '/dis/login?error=invalid_state'));
  }

  const clientId = process.env.ROBLOX_CLIENT_ID;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET;
  const redirectUri = getRobloxCallbackUrl(request).toString();

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Roblox OAuth credentials missing' }, { status: 500 });
  }

  try {
    // 1. Exchange authorization code for access token
    const tokenParams = new URLSearchParams();
    tokenParams.set('client_id', clientId);
    tokenParams.set('client_secret', clientSecret);
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);

    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Roblox token exchange failed:', errBody);
      return NextResponse.redirect(
        getRobloxReturnUrl(request, '/dis/login?error=token_exchange_failed'),
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch Userinfo from Roblox
    const userinfoRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!userinfoRes.ok) {
      return NextResponse.redirect(getRobloxReturnUrl(request, '/dis/login?error=userinfo_failed'));
    }

    const userinfo = await userinfoRes.json();
    const robloxUserId = String(userinfo.sub);
    const robloxUsername =
      userinfo.preferred_username || userinfo.name || `RobloxUser_${robloxUserId}`;
    const displayName = userinfo.name || robloxUsername;

    // 3. Fetch Group Role & Rank
    const groupRoleInfo = await getRobloxUserGroupRole(robloxUserId);
    if (!groupRoleInfo || groupRoleInfo.rank <= 0)
      return NextResponse.redirect(
        getRobloxReturnUrl(request, '/dis/login?error=not_group_member'),
      );
    const roleName = groupRoleInfo.roleName;
    const roleRank = groupRoleInfo?.rank || 0;
    const assignment = mapRobloxRoleToDis(roleName, roleRank);
    if (!assignment)
      return NextResponse.redirect(
        getRobloxReturnUrl(request, '/dis/login?error=role_not_authorized'),
      );
    const { role: disRole, trainingStage } = assignment;

    // 4. Ensure Appwrite User exists (Using deterministic ID roblox_<sub_hash_or_clean>)
    const appwriteUserId = `rbx_${robloxUserId}`;

    try {
      await users.get(appwriteUserId);
    } catch (error) {
      if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
      // Create user if not exists
      console.log(`Creating new Appwrite user for Roblox ID ${robloxUserId}...`);
      try {
        await users.create(
          appwriteUserId,
          `${robloxUserId}@roblox.local`,
          undefined,
          ID.unique(),
          displayName,
        );
      } catch (createError) {
        if (!(createError instanceof AppwriteException) || createError.code !== 409)
          throw createError;
        await users.get(appwriteUserId);
      }
    }

    // 5. Update or Create DIS Profile in Appwrite Database
    try {
      const existingProfile = await databases.getDocument(DB_ID, 'profiles', appwriteUserId);
      // Update existing profile with latest Roblox group role
      await databases.updateDocument(DB_ID, 'profiles', appwriteUserId, {
        name: displayName,
        callsign: `ZSSK-${robloxUserId.slice(-3)}`,
        role: disRole,
        ...(existingProfile.role !== disRole ? { trainingStage } : {}),
        robloxUserId,
        robloxUsername,
        robloxRoleName: roleName,
        robloxRank: roleRank,
      });
    } catch (error) {
      if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
      // Create profile document
      const newProfile = {
        userId: appwriteUserId,
        name: displayName,
        callsign: `ZSSK-${robloxUserId.slice(-3)}`,
        role: disRole,
        trainingStage,
        strikes: 0,
        robloxUserId,
        robloxUsername,
        robloxRoleName: roleName,
        robloxRank: roleRank,
      };
      try {
        await databases.createDocument(DB_ID, 'profiles', appwriteUserId, newProfile);
      } catch (createError) {
        if (!(createError instanceof AppwriteException) || createError.code !== 409)
          throw createError;
        // A concurrent callback created the same deterministic profile. Preserve its assessment.
        await databases.updateDocument(DB_ID, 'profiles', appwriteUserId, {
          name: displayName,
          role: disRole,
          robloxUserId,
          robloxUsername,
          robloxRoleName: roleName,
          robloxRank: roleRank,
        });
      }
    }

    // 6. Generate Custom Token via Appwrite Server SDK
    const customToken = await users.createToken(appwriteUserId);

    // 7. Redirect to frontend with token to complete client-side session creation
    const redirectUrl = getRobloxReturnUrl(request, '/dis/auth-complete');
    redirectUrl.searchParams.set('userId', customToken.userId);
    redirectUrl.searchParams.set('secret', customToken.secret);

    const res = NextResponse.redirect(redirectUrl.toString());
    // Clear oauth state cookie
    res.cookies.delete('roblox_oauth_state');
    return res;
  } catch (error: unknown) {
    console.error('Error during Roblox OAuth callback:', error);
    if (error instanceof RobloxGroupLookupError)
      return NextResponse.redirect(
        getRobloxReturnUrl(request, '/dis/login?error=group_lookup_failed'),
      );
    return NextResponse.redirect(getRobloxReturnUrl(request, '/dis/login?error=server_error'));
  }
}
