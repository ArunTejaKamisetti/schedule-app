'use client'

import { useState, useMemo } from 'react'
import { Users, Copy, UserPlus, Trash2, ArrowRight, Check, Sparkles, Search, CalendarClock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FreeTimeDialog } from '@/components/free-time-dialog'
import { useSession } from '@/components/session-provider'
import { useFriends } from '@/lib/hooks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'
import Link from 'next/link'

export default function FriendsPage() {
  const { userId, shareCode, user } = useSession()
  const { friends: rawFriends, isLoading: loading, mutate: mutateFriends } = useFriends(userId)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savedName, setSavedName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [friendSearch, setFriendSearch] = useState('')
  const [freeTimeOpen, setFreeTimeOpen] = useState(false)

  const myName = savedName || user?.display_name || ''

  // Accepted friends, named first then "Anonymous" — derived from the shared SWR cache.
  const friends = useMemo(() => {
    const accepted = rawFriends.filter((f) => f.status === 'accepted')
    accepted.sort((a, b) => {
      const an = a.friend?.display_name?.trim() ? 0 : 1
      const bn = b.friend?.display_name?.trim() ? 0 : 1
      if (an !== bn) return an - bn
      return (a.friend?.display_name ?? '').localeCompare(b.friend?.display_name ?? '')
    })
    return accepted
  }, [rawFriends])

  // Filter the friends list by name or share code.
  const visibleFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase()
    if (!q) return friends
    return friends.filter((f) =>
      (f.friend?.display_name ?? '').toLowerCase().includes(q) ||
      (f.friend?.share_code ?? '').toLowerCase().includes(q)
    )
  }, [friends, friendSearch])

  async function saveName() {
    const name = nameDraft.trim()
    if (!name || !userId) return
    setSavingName(true)
    await fetch('/api/user/name', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name }),
    }).catch(() => {})
    setSavedName(name)
    setSavingName(false)
    toast.success(`Hi ${name}! Friends will now see your name.`)
  }

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
      // Refresh the shared list (also reflected in Compare).
      mutateFriends()
    } finally {
      setAdding(false)
    }
  }

  async function removeFriend(friendId: string) {
    // Optimistically drop from the shared cache, then delete on the server.
    mutateFriends((prev) => (prev ?? []).filter((f) => f.friend_id !== friendId), { revalidate: false })
    await fetch(`/api/friends?userId=${userId}&friendId=${friendId}`, { method: 'DELETE' }).catch(() => {})
    toast.success('Friend removed')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Users className="text-indigo-600 dark:text-indigo-400" size={22} />
          <h1 className="text-xl font-bold text-foreground">Friends</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Your name — friends see this instead of "Anonymous". Optional but encouraged. */}
        {!myName ? (
          <div className="rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-indigo-600 dark:text-indigo-400" />
              <p className="text-sm font-bold text-foreground">What should friends call you?</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Right now you show up as <b className="text-foreground">“Anonymous”</b> on your friends&apos; lists. Add your name so they recognise you. (Optional)</p>
            <div className="flex gap-2">
              <Input
                placeholder="Your name…"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="text-sm bg-card"
              />
              <Button onClick={saveName} disabled={!nameDraft.trim() || savingName} size="sm">Save</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground -mb-2">
            Friends see you as <b className="text-foreground">{myName}</b> · change it in Settings
          </p>
        )}

        {/* Your code card */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 dark:bg-indigo-950/40 dark:border-indigo-900">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300 mb-1">Your share code</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold tracking-widest text-indigo-900 dark:text-indigo-100">
              {shareCode || '——————'}
            </span>
            <button
              onClick={copyCode}
              className="ml-auto p-2 rounded-lg bg-card border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
              title="Copy code"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-indigo-500" />}
            </button>
          </div>
          <p className="text-xs text-indigo-500 mt-1">Share this code with friends so they can add you</p>
        </div>

        {/* Add friend */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Add a friend</p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter 8-character code…"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="font-mono tracking-wider text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <Button onClick={addFriend} disabled={!addCode.trim() || adding} size="sm" title="Add friend by their Friends Code">
              <UserPlus size={16} />
            </Button>
          </div>
        </div>

        {/* Friends list */}
        <div>
          {/* Search + Free Time Analysis */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search friends…"
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                className="pl-9 bg-muted border-border text-sm"
              />
            </div>
            <button
              onClick={() => setFreeTimeOpen(true)}
              title="Free Time Analysis"
              className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <CalendarClock size={18} />
            </button>
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
          ) : visibleFriends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No friends match “{friendSearch}”.</p>
          ) : (
            <div className="space-y-2">
              {visibleFriends.map((f) => (
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

      <FreeTimeDialog userId={userId} open={freeTimeOpen} onOpenChange={setFreeTimeOpen} />
    </div>
  )
}

function FriendRow({ friend, userId, onRemove }: { friend: User; userId: string; onRemove: () => void }) {
  const initials = (friend.display_name ?? friend.share_code ?? '??').slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {friend.display_name ?? 'Anonymous'}
        </p>
        <p className="text-xs font-mono text-muted-foreground">{friend.share_code}</p>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={`/friends/compare?friendId=${friend.id}`}
          className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 transition-colors"
          title="Compare schedules"
        >
          <ArrowRight size={15} className="text-indigo-600 dark:text-indigo-400" />
        </Link>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg bg-muted hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          title="Remove friend"
        >
          <Trash2 size={14} className="text-muted-foreground hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}
