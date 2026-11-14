import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | AetherMart',
  description: 'Learn how AetherMart handles account, Google sign-in, and shopping information.',
};

const updatedOn = 'November 14, 2026';
const privacyEmail = 'ayushtiwari8420@gmail.com';

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="border-b border-stone-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">Legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-stone-500">Last updated: {updatedOn}</p>
        <p className="mt-5 text-base leading-7 text-stone-600">
          This policy explains how AetherMart collects, uses, and protects information when you
          browse the store, create an account, or sign in with Google.
        </p>
      </header>

      <div className="divide-y divide-stone-200">
        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-stone-600">
            <li>
              <strong className="text-stone-800">Google sign-in:</strong> Google account
              identifier, email address, name, and profile photo provided through the Google
              profile and email scopes. We use these details to create or link your AetherMart
              account and sign you in. We do not request access to Gmail, Drive, contacts, or
              calendars, and we do not store Google OAuth access or refresh tokens.
            </li>
            <li>
              <strong className="text-stone-800">Account and shopping information:</strong> details
              you provide, such as your name, email, cart, orders, delivery address, reviews, and
              payment references you submit during checkout.
            </li>
            <li>
              <strong className="text-stone-800">Service and session information:</strong>{' '}
              authentication cookies and basic technical or security logs needed to operate and
              protect the service.
            </li>
          </ul>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">How we use information</h2>
          <p className="leading-7 text-stone-600">
            We use information to provide and secure AetherMart, authenticate and maintain your
            account, link a Google sign-in to an existing account when the email matches, manage
            carts and orders, communicate about account and order activity, and respond to support
            requests.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Google user data</h2>
          <p className="leading-7 text-stone-600">
            AetherMart uses Google user data only for sign-in, account creation or linking, and
            displaying the profile details described above. We do not sell Google user data or use
            it for advertising. We share it only with service providers that help operate the
            service, when necessary to provide AetherMart, or when required by law. Google&apos;s
            own privacy policy applies to information Google collects directly.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">When information is shared</h2>
          <p className="leading-7 text-stone-600">
            We may process information with providers that support hosting, databases, email, search,
            and payment processing. These providers receive only information needed for their
            services. We may also disclose information to comply with law, protect users, or
            safeguard the service. We do not sell personal information.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Retention and your choices</h2>
          <p className="leading-7 text-stone-600">
            We keep information for as long as needed to provide the service, maintain account and
            order records, resolve disputes, and meet legal obligations. You can stop using Google
            sign-in through your Google account settings. To request access, correction, or deletion
            of your AetherMart account information, contact us using the address below. Some records
            may need to be retained where the law requires it.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Cookies and security</h2>
          <p className="leading-7 text-stone-600">
            We use authentication cookies to keep you signed in and apply reasonable technical
            safeguards to protect information. No online service can guarantee absolute security.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Changes and contact</h2>
          <p className="leading-7 text-stone-600">
            We may update this policy as the service changes. The updated date above indicates the
            latest revision. For privacy questions or account-data requests, email{' '}
            <a className="font-medium text-indigo-700 underline" href={`mailto:${privacyEmail}`}>
              {privacyEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
