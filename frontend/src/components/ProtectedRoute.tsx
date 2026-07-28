import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const userStr = localStorage.getItem('user');
  const isAuthenticated = !!userStr;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
