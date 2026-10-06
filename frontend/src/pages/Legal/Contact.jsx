import LegalPage from "./LegalPage";

const Contact = () => (
  <LegalPage
    title="Contact"
    introduction="The Human Testament is written by Chukwudi Okoh and published by Mount Scene Publishing in Lagos, Nigeria."
    sections={[
      {
        heading: "For inquiries",
        body: "For questions about the book, publishing, or permission to use its materials, please contact Mount Scene Publishing through its officially published contact channels.",
      },
      {
        heading: "Printed book updates",
        body: "The email sign-up on this site is not active yet. Details about availability and updates will be posted here when they are ready.",
      },
    ]}
  />
);

export default Contact;
