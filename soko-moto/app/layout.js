import './globals.css';
import Nav from '../components/Nav';
export const metadata={title:'Soko Moto | Local food, stronger communities',description:'A farmer-first marketplace to discover local produce, sell farm products, connect with buyers, share surplus food and find animal-care services.'};
export default function RootLayout({children}){return <html lang="en"><body><Nav/><div className="site-content">{children}</div><footer className="foot"><span className="footer-brand">Soko Moto</span><span>Local food. Fair connections. Stronger communities.</span><span>Built for farmers and buyers across Kenya.</span></footer></body></html>}
