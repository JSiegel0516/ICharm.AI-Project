import { authClient } from '@/lib/auth-client'; //import the auth client

export const signinGithub = async () => {
  const data = await authClient.signIn.social({
    provider: 'github',
    callbackURL: "/dashboard", 
    errorCallbackURL: "/error",
    newUserCallbackURL: "/welcome",
    disableRedirect: true,
  });
  return data;
};

export const signinGoogle = async () => {
  const data = await authClient.signIn.social({
    provider: 'google',
    callbackURL: "/dashboard", 
    errorCallbackURL: "/error",
    newUserCallbackURL: "/welcome",
    disableRedirect: true,
  });
  return data;
};

