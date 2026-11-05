import LegalPage from '@/app/components/legal/LegalPage';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service | JOP' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        By using JOP, you agree to these terms. If you do not agree, please do not use the service.
      </p>
      <section>
        <h2>Using JOP</h2>
        <p>
          Use the service responsibly and only with an account you are authorized to use. Do not
          disrupt the service, access data without permission, or misuse other users’ information.
          You must also follow Roblox’s applicable terms when using Roblox sign-in.
        </p>
      </section>
      <section>
        <h2>Access</h2>
        <p>
          Some features require a Roblox account and membership in an authorized group. Access may
          be restricted or removed if these requirements are not met or the service is misused.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          JOP is provided as available, without guarantees of uninterrupted operation or fitness for
          a particular purpose. Features may change or become unavailable.
        </p>
      </section>
      <section>
        <h2>Privacy and changes</h2>
        <p>
          Our <a href="/privacy-policy">Privacy Policy</a> explains how information is used. These
          terms may be updated; continued use after an update means you accept the updated terms.
        </p>
      </section>
    </LegalPage>
  );
}
