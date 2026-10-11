import Hero from '../../features/home/components/Hero';
import InquiryPaths from '../../features/home/components/InquiryPaths';
import Dialogue from '../../features/home/components/Dialogue';
import BookCollection from '../../features/home/components/BookCollection';
import FeaturedVerse from '../../features/home/components/FeaturedVerse';
import LivingInquiry from '../../features/home/components/LivingInquiry';
import PathOfInquiry from '../../features/home/components/PathOfInquiry';
import Sanctuary from '../../features/home/components/Sanctuary';
import EssayReflections from '../../features/home/components/EssayReflections';
import CommunitySection from '../../features/home/components/CommunitySection';
import PhysicalBookSection from '../../features/home/components/PhysicalBookSection';
import Footer from '../../components/layout/Footer';
const Home = () => {
  return (
    <main id="main-content" tabIndex={-1} className="bg-ivory">
      <Hero />
      <InquiryPaths />
      <BookCollection />
      <FeaturedVerse />
      <LivingInquiry />
      <PathOfInquiry />
      <Dialogue />
      <Sanctuary/>
      <EssayReflections />
      <CommunitySection />
      <PhysicalBookSection />
      <Footer />

    </main>
  );
};

export default Home;
