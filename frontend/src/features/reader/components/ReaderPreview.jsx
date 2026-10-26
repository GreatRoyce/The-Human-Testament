import { useChapter } from '../../testament/hooks/useChapter.js';
import { useReaderSelection } from '../hooks/useReaderSelection.js';
import ChapterReader from './ChapterReader.jsx';
import ResourceState from '../../../components/shared/ResourceState.jsx';

export default function ReaderPreview({ labels }) {
  const resource = useChapter('freedom', 10);
  const { selectedVerse, selectVerse } = useReaderSelection(resource.data, 14);
  return <ResourceState resource={resource} empty={resource.data?.verses.length === 0}>
    {resource.data && <ChapterReader content={{ ...resource.data, verses: resource.data.verses.filter(verse => verse.number >= 11 && verse.number <= 14) }} selectedVerse={selectedVerse} onSelect={selectVerse} labels={labels} />}
  </ResourceState>;
}
