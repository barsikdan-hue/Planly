import { createRoot } from 'react-dom/client';
import PlannerApp from '../../components/planner/app';
import '../../app/globals.css';

createRoot(document.getElementById('root')!).render(<PlannerApp />);
