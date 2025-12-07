"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Search, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  title: string | null;
}

interface MemberInviteProps {
  projectId: string;
}

export function MemberInvite({ projectId }: MemberInviteProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState("USER");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(searchQuery)}&excludeProject=${projectId}`
        );
        if (res.ok) {
          const users = await res.json();
          setSearchResults(users);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, projectId]);

  async function handleInvite() {
    if (!selectedUser) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          role: selectedRole,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        setSearchQuery("");
        setSelectedUser(null);
        setSelectedRole("USER");
        setSearchResults([]);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Kunne ikke legge til medlem");
      }
    } catch (err) {
      console.error(err);
      setError("Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setSearchQuery("");
      setSelectedUser(null);
      setSelectedRole("USER");
      setSearchResults([]);
      setError(null);
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus size={14} className="mr-1" />
          Inviter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter medlem til prosjekt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!selectedUser ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  type="search"
                  placeholder="Søk etter navn, e-post eller firma..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              {searching && (
                <p className="text-sm text-muted-foreground">Søker...</p>
              )}

              {searchResults.length > 0 && (
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                      onClick={() => setSelectedUser(user)}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium text-foreground">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {user.email}
                        </p>
                        {user.company && (
                          <p className="truncate text-xs text-muted-foreground">
                            {user.title ? `${user.title} @ ` : ""}{user.company}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Ingen brukere funnet
                </p>
              )}

              {searchQuery.length < 2 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Skriv minst 2 tegn for å søke
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                  {selectedUser.firstName[0]}
                  {selectedUser.lastName[0]}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-medium text-foreground">
                    {selectedUser.firstName} {selectedUser.lastName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {selectedUser.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                >
                  <X size={14} />
                </Button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Rolle i prosjektet
                </label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROJECT_LEADER">Prosjektleder</SelectItem>
                    <SelectItem value="USER">Bruker</SelectItem>
                    <SelectItem value="READER">Leser</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedRole === "PROJECT_LEADER" && "Kan redigere prosjekt og invitere medlemmer"}
                  {selectedRole === "USER" && "Kan endre status og kommentere"}
                  {selectedRole === "READER" && "Kun lesetilgang"}
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Avbryt
                </Button>
                <Button onClick={handleInvite} loading={loading}>
                  <Check size={14} className="mr-1" />
                  Legg til medlem
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
