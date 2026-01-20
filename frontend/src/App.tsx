import React, { useEffect } from 'react';
import DashboardPage from './pages/Dashboard';
import LoginPage from './pages/Login';
import { useAppDispatch, useAppSelector } from './store/store';
import { selectAuth, loadUser } from './store/slices/authSlice';

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, token } = useAppSelector(selectAuth);

  useEffect(() => {
    if (token && !isAuthenticated) {
      dispatch(loadUser());
    }
  }, [token, isAuthenticated, dispatch]);

  const shouldShowDashboard = isAuthenticated || Boolean(token);
  return shouldShowDashboard ? <DashboardPage /> : <LoginPage />;
};

export default App;
