import "./globals.css";
export const metadata={
  title:"Rede Mais Saúde | Recuperação",
  description:"Gestão de recuperação de faltosos",
  icons:{
    icon:[{url:"/icon.svg?v=20261009",type:"image/svg+xml"}],
    shortcut:[{url:"/icon.svg?v=20261009",type:"image/svg+xml"}],
    apple:[{url:"/icon.svg?v=20261009"}]
  }
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
