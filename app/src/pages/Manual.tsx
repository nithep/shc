import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, FileText } from 'lucide-react';

const Manual = () => {
  const [content, setContent] = useState<string>('# Loading Manual...');
  const [currentFile, setCurrentFile] = useState<string>('index');

  useEffect(() => {
    fetchDoc(currentFile);
  }, [currentFile]);

  const fetchDoc = async (filename: string) => {
    try {
      const res = await fetch(`/api/docs?file=${filename}`);
      const data = await res.json();
      if (data.success) {
        setContent(data.content);
      } else {
        setContent('# Document Not Found\nThe requested OKF file could not be loaded.');
      }
    } catch (err) {
      setContent('# Error\nFailed to connect to the backend server to load documents.');
    }
  };

  const menuItems = [
    { id: 'index', label: 'Knowledge Hub' },
    { id: 'frontend-architecture', label: 'Frontend Architecture' },
    { id: 'backend-architecture', label: 'Backend Architecture' },
    { id: 'prototype-strategy', label: 'Prototype Strategy' },
    { id: 'log', label: 'System Logs' },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[75vh]">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 bg-hotel-card rounded-2xl border border-slate-800 p-4 flex flex-col gap-2 h-fit">
        <div className="flex items-center gap-2 text-hotel-accent font-bold mb-4 px-2">
          <BookOpen size={20} />
          <span>OKF Manuals</span>
        </div>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentFile(item.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-left transition-colors ${
              currentFile === item.id
                ? 'bg-hotel-accent/10 text-hotel-accent border border-hotel-accent/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <FileText size={16} />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Markdown Content Area */}
      <div className="flex-1 bg-hotel-card rounded-2xl border border-slate-800 p-8 overflow-y-auto prose prose-invert prose-blue max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default Manual;
