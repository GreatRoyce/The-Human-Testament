import LegalPage from "./LegalPage";

const Privacy = () => (
  <LegalPage
    title="Privacy"
    introduction="This is an introductory privacy notice for The Human Testament website."
    sections={[
      {
        heading: "Information you provide",
        body: "The newsletter sign-up shown on this site is not currently active, and this site does not accept newsletter submissions through it. If you contact the publisher through another channel, the information you choose to share may be used to respond to your inquiry.",
      },
      {
        heading: "Site usage",
        body: "The site may process basic technical information required to deliver pages and keep the service working. This notice should be updated if the site adds analytics, accounts, or other features that collect personal information.",
      },
      {
        heading: "Questions",
        body: "For privacy questions, use the contact information provided by Mount Scene Publishing. This page is general information, not legal advice.",
      },
    ]}
  />
);

export default Privacy;