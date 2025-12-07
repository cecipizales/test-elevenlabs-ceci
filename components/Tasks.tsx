import React, { useState } from 'react';
import { Task } from '../types';
import { Plus, CheckCircle2, Circle } from 'lucide-react';

interface TasksProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

const Tasks: React.FC<TasksProps> = ({ tasks, setTasks }) => {
  const [input, setInput] = useState('');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setTasks([...tasks, { id: Date.now().toString(), text: input, completed: false }]);
    setInput('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  return (
    <div className="bg-studio-800 rounded-2xl p-6 border border-studio-700 h-full flex flex-col">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Session Goals</h3>
      
      <form onSubmit={addTask} className="relative mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a task..."
          className="w-full bg-studio-900 border border-studio-700 rounded-lg py-2 pl-3 pr-10 text-sm text-white focus:outline-none focus:border-accent"
        />
        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <Plus size={16} />
        </button>
      </form>

      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2">
        {tasks.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-4">
                No tasks yet. <br/> Tell Focus FM what you're working on!
            </div>
        )}
        {tasks.map(task => (
          <div 
            key={task.id}
            onClick={() => toggleTask(task.id)}
            className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
                task.completed ? 'opacity-50' : 'hover:bg-studio-700/50'
            }`}
          >
            {task.completed ? <CheckCircle2 className="text-accent w-5 h-5" /> : <Circle className="text-gray-500 w-5 h-5" />}
            <span className={`text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                {task.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tasks;