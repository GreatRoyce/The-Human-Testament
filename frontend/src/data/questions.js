import { manuscriptVerse } from '../services/manuscriptContent.js';

export const questions = [
  {
    id: 1,
    tag: "doubt",
    question: "Why do I believe?",
    premise:
      [manuscriptVerse('inquiry', 40, 9), manuscriptVerse('inquiry', 31, 6)].join(' '),
    ref: "BOOK I (INQUIRY) 40:9 · 31:6",
    Link: `ENTER THROUGH THIS QUESTION`,
  },
  {
    id: 2,
    tag: "self",
    question: "What am I becoming?",
    premise:
      [manuscriptVerse('identity', 14, 29), manuscriptVerse('identity', 7, 1)].join(' '),
    ref: "BOOK V (IDENTITY) 14:29 · 7:1",
    Link: `ENTER THROUGH THIS QUESTION`,
  },
  {
    id: 3,
    tag: "authority",
    question: "Does age, popularity, or tradition guarantee truth?",
    premise:
      manuscriptVerse('belief', 1, 6),
    ref: "BOOK IX (BELIEF) 1:6",
    Link: `ENTER THROUGH THIS QUESTION`,
  },
  {
    id: 4,
    tag: "MORTALITY",
    question: "Does anything of the person remain?",
    premise:
      manuscriptVerse('existence', 1, 5),
    ref: "BOOK VIII (EXISTENCE) 1:5",
    Link: "ENTER THROUGH THIS QUESTION",
  },
];
