import type {AppProps} from 'next/app';
import '../styles/capital-base.css';

export default function App({Component,pageProps}:AppProps){
 return <Component {...pageProps}/>;
}
