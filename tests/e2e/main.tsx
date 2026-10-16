import { createRoot } from 'react-dom/client';
import PlannerApp from '../../components/planner/app';
import '../../app/globals.css';
import LoginPage from '../../app/login/page';

createRoot(document.getElementById('root')!).render(window.location.pathname === '/login' ? <LoginPage /> : <PlannerApp />);
