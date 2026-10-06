import Hero from '../../components/home/Hero';
import InquiryPaths from '../../components/home/InquiryPaths';
import Dialogue from '../../components/home/Dialogue';
import BookCollection from '../../components/home/BookCollection';
import FeaturedVerse from '../../components/home/FeaturedVerse';
import LivingInquiry from '../../components/home/LivingInquiry';
import PathOfInquiry from '../../components/home/PathOfInquiry';
import Sanctuary from '../../components/home/Sanctuary';
import EssayReflections from '../../components/home/EssayReflections';
import CommunitySection from '../../components/home/CommunitySection';
import PhysicalBookSection from '../../components/home/PhysicalBookSection';
import Footer from '../../components/home/Footer';
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
