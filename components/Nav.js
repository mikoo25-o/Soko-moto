"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
const LINKS = [['/discover','Discover'],['/my-products','My Products'],['/orders','Orders'],['/messages','Messages'],['/donations','Donations'],['/vets','Vet Services']];
export default function Nav(){
  const path=usePathname(); const [open,setOpen]=useState(false);
  return <header className="nav"><Link href="/" className="brand" aria-label="Soko Moto home"><img src="/images/logo-transparent.png" alt="Soko Moto"/></Link>
    <button className="burger" aria-label="Toggle navigation" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'✕':'☰'}</button>
    <nav className={open?'open':''}>{LINKS.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={path===href||path.startsWith(href+'/')?'active':''}>{label}</Link>)}</nav>
    <Link className="nav-account" href="/account">Sign in / Join</Link>
  </header>
}
