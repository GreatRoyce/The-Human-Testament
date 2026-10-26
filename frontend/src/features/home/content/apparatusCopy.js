import { manuscriptContentProvider } from '../../../services/manuscriptContent.js';

export const apparatusCopy = {
  glossary: manuscriptContentProvider.getGlossary().find(entry => entry.term === 'Self-Worth'),
};
