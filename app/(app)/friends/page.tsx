'use client'

import { useState, useEffect } from 'react'
import { Users, Copy, UserPlus, Trash2, ArrowRight, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useSession } from '@/components/session-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Friendship, User } from '@/lib/types'
import Link from 'next/link'

export default function FriendsPage() {
  const { userId, shareCode } = useSession()
  const [friends, setFriends] = useState<(Friendship & { friend: User })[]>([])
  const [loading, setLoading] = useState(true)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!userId) return
    fetch(`/api/friends?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setFriends(data.filter((f: Friendship) => f.status === 'accepted'))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  function copyCode() {
    navigator.clipboard.writeText(shareCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Code copied!')
  }

  async function addFriend() {
    if (!addCode.trim() || !userId) return
    setAdding(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, shareCode: addCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Could not add friend')
        return
      }
      toast.success(`Added ${data.friend.display_name ?? 'friend'}!`)
      setAddCode('')
      // Refresh list
      const updated = await fetch(`/api/friends?userId=${userId}`).then((r) => r.json())
      setFriends(updated.filter((f: Friendship) => f.status === 'accepted'))
    } finally {
      setAdding(false)
    }
  }

  async function removeFriend(friendId: string) {
    await fetch(`/api/friends?userId=${userId}&friendId=${friendId}`, { method: 'DELETE' })
    setFriends((prev) => prev.filter((f) => f.friend_id !== friendId))
    toast.success('Friend removed')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Users className="text-indigo-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">Friends</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Your code card */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs font-medium text-indigo-600 mb-1">Your share code</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold tracking-widest text-indigo-900">
              {shareCode || '——————'}
            </span>
            <button
              onClick={copyCode}
              className="ml-auto p-2 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors"
              title="Copy code"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-indigo-500" />}
            </button>
          </div>
          <p className="text-xs text-indigo-500 mt-1">Share this code with friends so they can add you</p>
        </div>

        {/* Add friend */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Add a friend</p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter 8-character code…"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="font-mono tracking-wider text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <Button onClick={addFriend} disabled={!addCode.trim() || adding} size="sm">
              <UserPlus size={16} />
            </Button>
          </div>
        </div>

        {/* Friends list */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {friends.length} Friend{friends.length !== 1 ? 's' : ''}
          </p>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Users size={32} strokeWidth={1} className="mx-auto mb-2" />
              <p className="text-sm">No friends added yet</p>
              <p className="text-xs mt-1">Share your code or enter a friend&apos;s code above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <FriendRow
                  key={f.friend_id}
                  friend={f.friend}
                  userId={userId}
                  onRemove={() => removeFriend(f.friend_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FriendRow({ friend, userId, onRemove }: { friend: User; userId: string; onRemove: () => void }) {
  const initials = (friend.display_name ?? friend.share_code ?? '??').slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {friend.display_name ?? 'Anonymous'}
        </p>
        <p className="text-xs font-mono text-gray-400">{friend.share_code}</p>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={`/friends/compare?friendId=${friend.id}`}
          className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
          title="Compare schedules"
        >
          <ArrowRight size={15} className="text-indigo-600" />
        </Link>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg bg-gray-50 hover:bg-red-50 transition-colors"
          title="Remove friend"
        >
          <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}
