'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, FolderGit } from 'lucide-react';

interface RepoInputProps {
  onRepoCloned: (data: {
    repoUrl: string;
    repoPath: string;
    files: string[];
    stats: {
      totalFiles: number;
      codeFiles: number;
      totalLines: number;
    };
  }) => void;
}

export function RepoInput({ onRepoCloned }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    setIsCloning(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/clone-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clone repository');
      }

      setSuccess(true);
      onRepoCloned({
        repoUrl: repoUrl.trim(),
        repoPath: data.localPath,
        files: data.files,
        stats: data.stats,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository');
    } finally {
      setIsCloning(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCloning) {
      handleClone();
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="glass rounded-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <FolderGit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Connect GitHub Repository</h3>
            <p className="text-sm text-white/50">Clone a repo to analyze real code</p>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="https://github.com/owner/repository"
              disabled={isCloning}
              className="w-full px-4 py-3 pl-12 rounded-xl bg-white/5 border border-white/10 
                       text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            />
            <FolderGit className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
          </div>

          {/* Examples */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-white/30">Examples:</span>
            {[
              'https://github.com/vercel/next.js',
              'https://github.com/facebook/react',
            ].map((example) => (
              <button
                key={example}
                onClick={() => setRepoUrl(example)}
                disabled={isCloning}
                className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 
                         hover:text-white/80 transition-colors disabled:opacity-50"
              >
                {example.split('/').slice(-2).join('/')}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-400">{error}</span>
          </motion.div>
        )}

        {/* Success */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20"
          >
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">Repository cloned successfully!</span>
          </motion.div>
        )}

        {/* Clone Button */}
        <button
          onClick={handleClone}
          disabled={isCloning || !repoUrl.trim()}
          className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500
                   hover:from-blue-600 hover:to-purple-600 disabled:from-gray-500 disabled:to-gray-600
                   text-white font-medium transition-all disabled:cursor-not-allowed
                   flex items-center justify-center gap-2"
        >
          {isCloning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Cloning repository...</span>
            </>
          ) : (
            <>
              <FolderGit className="w-5 h-5" />
              <span>Clone Repository</span>
            </>
          )}
        </button>

        {/* Info */}
        <div className="text-xs text-white/30 space-y-1">
          <p>• Repository will be cloned to server for analysis</p>
          <p>• Only public repositories are supported</p>
          <p>• Cloned files are automatically cleaned up after analysis</p>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
