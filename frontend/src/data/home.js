import { manuscriptSection, manuscriptVerse } from '../services/manuscriptContent.js';

const reader = manuscriptSection('TO THE READER');
const ending = manuscriptSection('CLOSING TEXT');
export const home = {
  hero: {
    title: "THE HUMAN TESTAMENT",
    question: "What does it mean to be human?",
    canonicalText: ending[0],
    primaryAction: "Enter the Testament",
    secondaryAction: "Explore the Questions",
  },
  introduction: {
    label: "THE TESTAMENT",
    title: reader[1],
    text: reader[2],
  },
  corpus: { label: "THE CORPUS", title: "Ten Books" },
  featuredVerse: {
    label: "ENTER A VERSE",
    reference: "Inquiry 1:1",
    text: manuscriptVerse('inquiry', 1, 1),
  },
  questions: {
    label: "QUESTIONS",
    title: "Questions Worth Exploring",
    type: "editorial",
    prompts: [
      "Why do human beings defend beliefs they inherited?",
      "What happens when certainty is never examined?",
      "What makes a belief worthy of keeping?",
      "What does it mean to be human?",
    ],
  },
  paths: {
    label: "PATHS OF INQUIRY",
    title: "Follow an idea.",
    paths: [
      ["Inquiry", "Freedom", "Power", "Society"],
      ["Identity", "Relationships", "Humanity"],
      ["Existence", "Belief", "Purpose"],
    ],
  },
  community: {
    label: "COMMUNITY",
    title: "Think together.",
    features: ["Discussions", "Reading Circles", "Questions", "Personal Notes"],
    status: "future",
  },
  reading: {
    label: "READING",
    title: "Continue your exploration.",
    features: ["Saved Verses", "Personal Library", "Reading Progress", "Reading History"],
    status: "future",
  },
  physicalBook: {
    label: "THE PHYSICAL TESTAMENT",
    title: "The Human Testament",
    description: "The physical book remains part of the wider reading experience.",
  },
  closing: {
    canonicalText: ending.at(-1),
  },
};
