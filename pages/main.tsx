import { createRoot } from 'react-dom/client';
import App from './App';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('页面加载失败，请刷新重试。');
createRoot(root).render(<App />);
