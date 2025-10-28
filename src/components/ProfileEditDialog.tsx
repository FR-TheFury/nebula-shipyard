import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Edit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import imageCompression from 'browser-image-compression';

interface ProfileEditDialogProps {
  profile: {
    id: string;
    display_name: string;
    handle: string;
    bio_md: string | null;
    avatar_url: string | null;
    stats?: any;
  };
}

export function ProfileEditDialog({ profile }: ProfileEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio_md || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({
    space_combat: profile.stats?.space_combat || 0,
    fps_combat: profile.stats?.fps_combat || 0,
    piloting: profile.stats?.piloting || 0,
    exploration: profile.stats?.exploration || 0,
    trading: profile.stats?.trading || 0,
    mining: profile.stats?.mining || 0,
    search_rescue: profile.stats?.search_rescue || 0,
    reputation: profile.stats?.reputation || 0,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select an image file',
      });
      return;
    }

    // Compress image
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      setAvatarFile(compressedFile);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error compressing image:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to process image',
      });
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user) return avatarUrl;

    setUploading(true);
    try {
      // Generate unique filename
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Failed to upload avatar image',
      });
      return avatarUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim() || !handle.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Display name and handle are required',
      });
      return;
    }

    setLoading(true);
    try {
      // Upload avatar if changed
      const finalAvatarUrl = avatarFile ? await uploadAvatar() : avatarUrl;

      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          handle: handle.trim(),
          bio_md: bio.trim() || null,
          avatar_url: finalAvatarUrl,
          stats: stats,
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['profile', profile.id] });

      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated',
      });

      setOpen(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: 'Failed to update profile. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto gap-2">
          <Edit className="w-4 h-4" />
          Edit Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24">
              <AvatarImage src={previewUrl || avatarUrl || undefined} />
              <AvatarFallback className="text-2xl">
                {displayName?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex gap-2">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Upload Photo</span>
                </div>
                <Input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </Label>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name *</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              required
              maxLength={50}
            />
          </div>

          {/* Handle */}
          <div className="space-y-2">
            <Label htmlFor="handle">Handle *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="username"
                required
                maxLength={30}
                className="pl-8"
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {bio.length}/500 characters
            </p>
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <Label>Stats & Skills (0-100)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="space_combat" className="text-xs text-muted-foreground">Space Combat</Label>
                <Input
                  id="space_combat"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.space_combat}
                  onChange={(e) => setStats({...stats, space_combat: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fps_combat" className="text-xs text-muted-foreground">FPS Combat</Label>
                <Input
                  id="fps_combat"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.fps_combat}
                  onChange={(e) => setStats({...stats, fps_combat: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="piloting" className="text-xs text-muted-foreground">Piloting</Label>
                <Input
                  id="piloting"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.piloting}
                  onChange={(e) => setStats({...stats, piloting: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exploration" className="text-xs text-muted-foreground">Exploration</Label>
                <Input
                  id="exploration"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.exploration}
                  onChange={(e) => setStats({...stats, exploration: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="trading" className="text-xs text-muted-foreground">Trading</Label>
                <Input
                  id="trading"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.trading}
                  onChange={(e) => setStats({...stats, trading: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mining" className="text-xs text-muted-foreground">Mining</Label>
                <Input
                  id="mining"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.mining}
                  onChange={(e) => setStats({...stats, mining: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="search_rescue" className="text-xs text-muted-foreground">Search & Rescue</Label>
                <Input
                  id="search_rescue"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.search_rescue}
                  onChange={(e) => setStats({...stats, search_rescue: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reputation" className="text-xs text-muted-foreground">Reputation</Label>
                <Input
                  id="reputation"
                  type="number"
                  min="0"
                  max="100"
                  value={stats.reputation}
                  onChange={(e) => setStats({...stats, reputation: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {(loading || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {uploading ? 'Uploading...' : loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
