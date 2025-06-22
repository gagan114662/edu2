import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const { user } = useAuth();
  
  const navItems = [
    { path: '/', label: 'Voice Tutor', icon: '🎤' },
    { path: '/curriculum', label: 'Curriculum', icon: '📚' },
    { path: '/chat', label: 'AI Chat', icon: '💬' },
    { path: '/dashboard', label: 'Progress', icon: '📊' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];

  if (user?.user_role === 'parent') {
    navItems.push({ path: '/parent-dashboard', label: 'My Children', icon: '👨‍👩‍👧‍👦' });
  }

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-1">
            <span className="text-xl font-bold text-blue-600 mr-4">AI Tutor</span>
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={() => window.location.href = '/login'}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;