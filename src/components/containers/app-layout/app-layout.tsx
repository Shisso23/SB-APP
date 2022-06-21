import React from 'react';

export const AppLayout: React.FC = ({ children }: {children: any}) => {
  return (
    <div className="flex flex-1 flex-row">
      <div className="flex flex-1 flex-col">
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
