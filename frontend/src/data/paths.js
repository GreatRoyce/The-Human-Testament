import { createElement } from "react";
import { MdKey } from "react-icons/md";
import { FiEye, FiShield, FiBookOpen } from "react-icons/fi";
import { FaBalanceScale } from "react-icons/fa";
import { TbSeedling } from "react-icons/tb";
import { manuscriptVerse } from '../services/manuscriptContent.js';


export const inquiryPaths = [
  {
    id: 1,
    icon: createElement(MdKey),
    path: "Inheritance",
    verse:
      `“${manuscriptVerse('inquiry', 1, 5)}” Inquiry 1:5`,
    books: [{id: 1, name: "Inquiry"}, {id: 2, name: "Belief"}, {id: 3, name: "Relationships"}, {id: 4, name: "Humanity"}],
  },
  {
    id: 2,
    icon: createElement(FiEye),
    path: "Approval",
    verse:
      `“${manuscriptVerse('society', 2, 8)}” Society 2:8`,
    books: [{id: 1, name: "Inquiry"}, {id: 2, name: "Freedom"}, {id: 3, name: "Society"}, {id: 4, name: "Purpose"}],
  },
  {
    id: 3,
    icon: createElement(FiShield),
    path: "Fear",
    verse:
      `“${manuscriptVerse('society', 5, 1)}” Society 5:1`,
    books: [{id: 1, name: "Freedom"}, {id: 2, name: "Power"}, {id: 3, name: "Society"}, {id: 4, name: "Purpose"}],
  },
  {
    id: 4,
    icon: createElement(FaBalanceScale),
    path: "Certainty",
    verse:
      `“${manuscriptVerse('inquiry', 12, 3)}” Inquiry 12:3`,
    books: [{id: 1, name: "Inquiry"}, {id: 2, name: "Freedom"}, {id: 3, name: "Humanity"}, {id: 4, name: "Belief"}],
  },
  {
    id: 5,
    icon: createElement(FiBookOpen),
    path: "Story",
    verse:
      `“${manuscriptVerse('relationships', 2, 6)}” Relationships 2:6`,
    books: [{id: 1, name: "Freedom"}, {id: 2, name: "Relationships"}, {id: 3, name: "Humanity"}, {id: 4, name: "Purpose"}],
  },
  {
    id: 6,
    icon: createElement(TbSeedling),
    path: "Contentment",
    verse:
      `“${manuscriptVerse('power', 13, 1)}” Power 13:1`,
    books: [{id: 1, name: "Power"}, {id: 2, name: "Society"}, {id: 3, name: "Purpose"}],
  },
];

export default inquiryPaths;
