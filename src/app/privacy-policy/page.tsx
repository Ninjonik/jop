import LegalPage from '@/app/components/legal/LegalPage';
import {LocalizedText} from '@/lib/i18n/client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy | JOP' };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {' '}
        <LocalizedText text="This policy describes how JOP handles information when you use the service, including signing in with Roblox." />{' '}
      </p>
      <section>
        <h2>
          <LocalizedText text="Information we use" />
        </h2>
        <p>
          {' '}
          <LocalizedText text="When you sign in with Roblox, JOP receives your Roblox user ID, username and display name. It also checks your membership, role and rank in the configured Roblox group. JOP stores a profile containing this information and your assigned service role. Information you enter or create while using the service may also be stored." />{' '}
        </p>
      </section>
      <section>
        <h2>
          <LocalizedText text="How information is used" />
        </h2>
        <p>
          {' '}
          <LocalizedText text="We use this information to sign you in, determine access, operate the service and maintain user profiles. Roblox processes your sign-in under its own privacy policy. JOP uses Appwrite to store account and profile information." />{' '}
        </p>
      </section>
      <section>
        <h2>
          <LocalizedText text="Cookies and sessions" />
        </h2>
        <p>
          {' '}
          <LocalizedText text="JOP uses a temporary cookie to protect the Roblox sign-in process and session information to keep you signed in." />{' '}
        </p>
      </section>
      <section>
        <h2>
          <LocalizedText text="Retention and requests" />
        </h2>
        <p>
          {' '}
          <LocalizedText text="Information is retained as needed to operate and administer the service. To ask about your information or request its correction or deletion, contact the JOP service administrator." />{' '}
        </p>
      </section>
      <section>
        <h2>
          <LocalizedText text="Changes" />
        </h2>
        <p>
          {' '}
          <LocalizedText text="This policy may be updated as the service changes. The current version will be available on this page." />{' '}
        </p>
      </section>
    </LegalPage>
  );
}
