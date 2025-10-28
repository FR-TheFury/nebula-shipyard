import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';

export default function CreateGalleryPost() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [gif, setGif] = useState<File | null>(null);
  const [gifPreview, setGifPreview] = useState<string | null>(null);

  if (!user || !isAdmin()) {
    navigate('/');
    return null;
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (images.length + files.length > 10) {
      toast({ variant: 'destructive', title: 'Limit', description: 'Maximum 10 images' });
      return;
    }

    try {
      const compressed = await Promise.all(
        files.map(f => imageCompression(f, { maxSizeMB: 2, maxWidthOrHeight: 1920 }))
      );
      
      setImages(prev => [...prev, ...compressed]);
      
      compressed.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => setPreviews(prev => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to process images' });
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a video file' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast({ variant: 'destructive', title: 'Error', description: 'Video must be under 50MB' });
      return;
    }

    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const handleGifSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('gif')) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a GIF file' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({ variant: 'destructive', title: 'Error', description: 'GIF must be under 10MB' });
      return;
    }

    setGif(file);
    setGifPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ variant: 'destructive', title: 'Validation', description: 'Title required' });
      return;
    }
    if (images.length === 0 && !video && !gif) {
      toast({ variant: 'destructive', title: 'Validation', description: 'At least one media file required' });
      return;
    }

    setLoading(true);
    try {
      let videoUrl = null;
      let gifUrl = null;

      // Upload video if exists
      if (video) {
        const videoFileName = `${user.id}-${Date.now()}-video.${video.name.split('.').pop()}`;
        const { error: videoError } = await supabase.storage
          .from('gallery')
          .upload(`${user.id}/${videoFileName}`, video);
        
        if (videoError) throw videoError;
        const { data } = supabase.storage.from('gallery').getPublicUrl(`${user.id}/${videoFileName}`);
        videoUrl = data.publicUrl;
      }

      // Upload gif if exists
      if (gif) {
        const gifFileName = `${user.id}-${Date.now()}-gif.${gif.name.split('.').pop()}`;
        const { error: gifError } = await supabase.storage
          .from('gallery')
          .upload(`${user.id}/${gifFileName}`, gif);
        
        if (gifError) throw gifError;
        const { data } = supabase.storage.from('gallery').getPublicUrl(`${user.id}/${gifFileName}`);
        gifUrl = data.publicUrl;
      }

      // Create post
      const { data: post, error: postError } = await supabase.from('gallery_posts').insert({
        created_by: user.id,
        title: title.trim(),
        description_md: description.trim() || null,
        location: location.trim() || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        video_url: videoUrl,
        gif_url: gifUrl,
      }).select().single();

      if (postError) throw postError;

      // Upload images
      if (images.length > 0) {
        const imageUrls = await Promise.all(
          images.map(async (file, idx) => {
            const fileName = `${user.id}-${Date.now()}-${idx}.${file.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage
              .from('gallery')
              .upload(`${user.id}/${fileName}`, file);
            
            if (uploadError) throw uploadError;
            const { data } = supabase.storage.from('gallery').getPublicUrl(`${user.id}/${fileName}`);
            return data.publicUrl;
          })
        );

        // Insert image records
        const { error: imagesError } = await supabase.from('gallery_images').insert(
          imageUrls.map((url, idx) => ({
            post_id: post.id,
            image_url: url,
            idx,
          }))
        );

        if (imagesError) throw imagesError;
      }

      toast({ title: 'Success', description: 'Gallery post created!' });
      navigate('/gallery');
    } catch (error) {
      console.error('Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create post' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Create Gallery Post</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Share your captures from the verse</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Post</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} 
                placeholder="Post title" required maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your post..." rows={4} maxLength={1000} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location (in Star Citizen)</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., ArcCorp, Crusader" maxLength={100} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="screenshot, ship, landscape" maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label>Images (max 10)</Label>
              {previews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {previews.map((url, idx) => (
                    <div key={idx} className="relative">
                      <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-32 object-cover rounded-lg" />
                      <Button type="button" size="icon" variant="destructive" 
                        className="absolute top-1 right-1 h-6 w-6" onClick={() => removeImage(idx)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Label htmlFor="images-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-md hover:bg-secondary/80">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Upload Images ({images.length}/10)</span>
                </div>
                <Input id="images-upload" type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Video (optional, max 50MB)</Label>
              {videoPreview && (
                <div className="relative">
                  <video src={videoPreview} controls className="w-full rounded-lg max-h-64" />
                  <Button type="button" size="icon" variant="destructive" 
                    className="absolute top-1 right-1 h-6 w-6" 
                    onClick={() => { setVideo(null); setVideoPreview(null); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <Label htmlFor="video-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-md hover:bg-secondary/80">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{video ? 'Change Video' : 'Upload Video'}</span>
                </div>
                <Input id="video-upload" type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
              </Label>
            </div>

            <div className="space-y-2">
              <Label>GIF (optional, max 10MB)</Label>
              {gifPreview && (
                <div className="relative">
                  <img src={gifPreview} alt="GIF preview" className="w-full rounded-lg max-h-64" />
                  <Button type="button" size="icon" variant="destructive" 
                    className="absolute top-1 right-1 h-6 w-6" 
                    onClick={() => { setGif(null); setGifPreview(null); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <Label htmlFor="gif-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-md hover:bg-secondary/80">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{gif ? 'Change GIF' : 'Upload GIF'}</span>
                </div>
                <Input id="gif-upload" type="file" accept="image/gif" onChange={handleGifSelect} className="hidden" />
              </Label>
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/gallery')} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Creating...' : 'Create Post'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
