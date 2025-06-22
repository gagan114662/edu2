import React from 'react';

const NotificationCard = ({ notifications, onDismiss }) => {
  if (!notifications || notifications.length === 0) {
    return null;
  }

  const getNotificationStyle = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'achievement':
        return 'bg-purple-50 border-purple-200 text-purple-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return '🎉';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      case 'achievement':
        return '🏆';
      default:
        return '📢';
    }
  };

  return (
    <div className="space-y-3">
      {notifications.map((notification, index) => (
        <div
          key={notification.id || index}
          className={`border rounded-lg p-4 ${getNotificationStyle(notification.type)}`}
        >
          <div className="flex justify-between items-start">
            <div className="flex items-start space-x-3">
              <span className="text-lg">{getIcon(notification.type)}</span>
              <div>
                <h4 className="font-medium">{notification.title}</h4>
                <p className="text-sm mt-1">{notification.message}</p>
                {notification.timestamp && (
                  <p className="text-xs mt-2 opacity-75">
                    {new Date(notification.timestamp).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(notification.id || index)}
                className="text-gray-400 hover:text-gray-600 ml-4"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationCard;