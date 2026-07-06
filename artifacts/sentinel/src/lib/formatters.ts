export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  
  const isToday = date.getDate() === now.getDate() && 
                  date.getMonth() === now.getMonth() && 
                  date.getFullYear() === now.getFullYear();
                  
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'ready':
    case 'success':
    case 'resolved':
      return 'text-[#34D399]';
    case 'review':
    case 'warning':
    case 'pending':
      return 'text-[#FBBF24]';
    case 'action_required':
    case 'corrupted':
    case 'error':
      return 'text-[#F87171]';
    case 'in_progress':
    case 'scanning':
    case 'info':
      return 'text-[#60A5FA]';
    default:
      return 'text-white/50';
  }
}
