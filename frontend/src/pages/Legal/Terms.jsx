import LegalPage from "./LegalPage";

const Terms = () => (
  <LegalPage
    title="Terms of Use"
    introduction="By using The Human Testament website, you agree to use it lawfully and respectfully."
    sections={[
      {
        heading: "Website content",
        body: "The text, design, and other materials on this site are provided for reading and personal reference. Unless a page says otherwise or permission is granted, do not republish or commercially use the materials.",
      },
      {
        heading: "Availability",
        body: "Some parts of the site may be incomplete or unavailable while the project is being developed. Website content is provided for general information and may be changed without notice.",
      },
      {
        heading: "Contact",
        body: "If you have a question about these terms or permission to use site content, contact Mount Scene Publishing using its published contact details.",
      },
    ]}
  />
);

export default Terms;