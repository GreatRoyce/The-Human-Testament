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
        body: "Optional website analytics start only after you choose Allow analytics in the website analytics controls. You can turn them off there at any time. Do Not Track and Global Privacy Control signals take priority. Browser identifiers are random, expire after 90 days, and are stored only with consent; anonymous tab sessions expire after 30 minutes of inactivity. Withdrawing consent removes these identifiers and stops future collection; previously recorded pseudonymous events remain until retention expires.",
      },
      {
        heading: "What analytics collect",
        body: "When enabled, analytics record public page paths, content type, server time, hashed browser/session identifiers, a referring hostname if available, and whether a valid login accompanied the view. They do not store user IDs, raw IP addresses, full referrer URLs, search text, query strings, account screens, private circle discussion pages, private reading history, passwords or notes. Owner and Admin analytics access is separately granted; reports contain aggregate statistics. Events are retained for an operator-configured 7 to 365 days (180 by default). Deployment retention is shown in authorized reports. Browser estimates are not exact counts of people. Server access logs and account data have separate purposes and are not used as analytics history.",
      },
      {
        heading: "Questions",
        body: "For privacy questions, use the contact information provided by Mount Scene Publishing. This page is general information, not legal advice.",
      },
    ]}
  />
);

export default Privacy;
