import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: () => boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Fetch user role and approval status after state update (avoid deadlock)
        if (session?.user) {
          setTimeout(() => {
            Promise.all([
              supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', session.user.id)
                .single(),
              supabase
                .from('profiles')
                .select('approved')
                .eq('id', session.user.id)
                .single()
            ]).then(([rolesRes, profileRes]) => {
              setUserRole(rolesRes.data?.role || 'user');
              setIsApproved(profileRes.data?.approved || false);
              
              // Sign out if not approved
              if (profileRes.data && !profileRes.data.approved) {
                toast({
                  variant: 'destructive',
                  title: 'Compte en attente',
                  description: 'Votre compte doit être approuvé par un administrateur avant de pouvoir vous connecter.',
                });
                supabase.auth.signOut();
              }
            });
          }, 0);
        } else {
          setUserRole('user');
          setIsApproved(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Fetch user role and approval status
      if (session?.user) {
        setTimeout(() => {
          Promise.all([
            supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id)
              .single(),
            supabase
              .from('profiles')
              .select('approved')
              .eq('id', session.user.id)
              .single()
          ]).then(([rolesRes, profileRes]) => {
            setUserRole(rolesRes.data?.role || 'user');
            setIsApproved(profileRes.data?.approved || false);
            
            // Sign out if not approved
            if (profileRes.data && !profileRes.data.approved) {
              toast({
                variant: 'destructive',
                title: 'Compte en attente',
                description: 'Votre compte doit être approuvé par un administrateur avant de pouvoir vous connecter.',
              });
              supabase.auth.signOut();
            }
          });
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUserRole('user');
      toast({
        title: "Signed out successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error signing out",
        description: error.message,
      });
    }
  };

  const isAdmin = () => {
    return userRole === 'admin';
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, isApproved, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
