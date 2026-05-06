import NavBar from "@/components/NavBar";
import Banner from "@/components/Banner";
import ServiceCards from "@/components/ServiceCards";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <NavBar />
      <Banner />
      <main className="relative z-10 pb-8">
        <ServiceCards />
      </main>
      <Footer />
    </div>
  );
}
