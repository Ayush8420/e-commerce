import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use | AetherMart',
  description: 'Read the terms that apply when using the AetherMart storefront and services.',
};

const updatedOn = 'November 14, 2026';
const contactEmail = 'ayushtiwari8420@gmail.com';

export default function TermsOfUsePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="border-b border-stone-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">Legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Terms of Use
        </h1>
        <p className="mt-3 text-sm text-stone-500">Last updated: {updatedOn}</p>
        <p className="mt-5 text-base leading-7 text-stone-600">
          These terms apply to your use of the AetherMart website, account, and shopping features.
          By using the service, you agree to these terms.
        </p>
      </header>

      <div className="divide-y divide-stone-200">
        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Accounts and sign-in</h2>
          <p className="leading-7 text-stone-600">
            You must provide accurate account information and keep your sign-in credentials secure.
            You are responsible for activity on your account. If you use Google sign-in, you
            authorize AetherMart to receive and use the Google profile information described in our{' '}
            <Link className="font-medium text-indigo-700 underline" href="/privacy-policy">
              Privacy Policy
            </Link>
            . Your Google account remains subject to Google&apos;s terms. AetherMart is not
            affiliated with or endorsed by Google.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Orders and payments</h2>
          <p className="leading-7 text-stone-600">
            Product descriptions, availability, prices, delivery details, and applicable payment
            instructions are shown in the store or at checkout and may change. Orders are subject to
            confirmation and availability. You agree to provide accurate delivery and payment
            information and to submit only payment references that relate to your order. Any
            third-party payment method is also subject to that provider&apos;s terms.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Acceptable use</h2>
          <p className="leading-7 text-stone-600">
            Do not misuse the service, interfere with its operation or security, attempt
            unauthorized access, submit fraudulent information, or use the service in violation of
            applicable law. We may restrict access when reasonably needed to protect AetherMart or
            its users.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">AetherMart content</h2>
          <p className="leading-7 text-stone-600">
            The AetherMart name, branding, software, and original site content are owned by or
            licensed to AetherMart. You may use the service for personal shopping purposes; these
            terms do not transfer ownership of the site or its content to you.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Service availability</h2>
          <p className="leading-7 text-stone-600">
            We work to keep the service available and accurate, but do not guarantee uninterrupted
            operation or that every listing will always be available. To the extent permitted by
            applicable law, the service is provided on an &quot;as available&quot; basis.
          </p>
        </section>

        <section className="space-y-3 py-7">
          <h2 className="text-xl font-semibold text-gray-900">Changes and contact</h2>
          <p className="leading-7 text-stone-600">
            We may update these terms as the service changes. Continued use after an update means
            you accept the revised terms. For questions, contact{' '}
            <a className="font-medium text-indigo-700 underline" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
