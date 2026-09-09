#!/bin/sh
cd "$(dirname "$0")" || exit 1
PIDS=$(ps -eo pid,args | awk '/next-server|next start|next dev/ && !/awk/ {print $1}')
for p in $PIDS; do
  [ "$p" = "$$" ] && continue
  kill "$p" 2>/dev/null
done
sleep 3
nohup npm run start > start.log 2>&1 &
echo $! > start.pid
sleep 8
tail -n 6 start.log
