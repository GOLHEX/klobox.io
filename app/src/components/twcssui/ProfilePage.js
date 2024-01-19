import React from 'react';

function ProfilePage({ user }) {
  // предполагаем, что объект user содержит информацию о пользователе

  return (
    <div className="flex items-center justify-center h-screen bg-gray-200">
      <div className="w-full max-w-xs">
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <div className="mb-4">
            <h1 className="block text-gray-700 text-xl font-bold mb-2">Profile</h1>
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            {/* Вывод другой информации о пользователе */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
