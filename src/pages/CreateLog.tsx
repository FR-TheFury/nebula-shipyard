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

export default function CreateLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image' });
      return;
    }

    try {
      const compressed = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920 });
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(compressed);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to process image' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast({ variant: 'destructive', title: 'Validation', description: 'Title and content required' });
      return;
    }

    setLoading(true);
    try {
      let imageUrl = null;

      if (imageFile) {
        const fileName = `${user.id}-${Date.now()}.${imageFile.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(`${user.id}/${fileName}`, imageFile);
        
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('posts').getPublicUrl(`${user.id}/${fileName}`);
        imageUrl = data.publicUrl;
      }

      const { error } = await supabase.from('logs').insert({
        user_id: user.id,
        title: title.trim(),
        body_md: body.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        image_url: imageUrl,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Pilot log created!' });
      navigate('/logs');
    } catch (error) {
      console.error('Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create log' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Create Pilot Log</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Document your journey in the verse</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} 
                placeholder="Mission log title" required maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Content *</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Describe your adventure..." rows={10} required maxLength={5000} />
              <p className="text-xs text-muted-foreground">{body.length}/5000</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="exploration, combat, trading" maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label>Image</Label>
              {previewUrl && (
                <div className="relative">
                  <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  <Button type="button" size="icon" variant="destructive" 
                    className="absolute top-2 right-2" onClick={() => { setImageFile(null); setPreviewUrl(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Label htmlFor="image-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-md hover:bg-secondary/80">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{imageFile ? 'Change Image' : 'Upload Image'}</span>
                </div>
                <Input id="image-upload" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              </Label>
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/logs')} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Creating...' : 'Create Log'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
