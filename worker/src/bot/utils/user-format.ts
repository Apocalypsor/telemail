export const formatUserName = (user: {
  first_name: string;
  last_name?: string | null;
}): string => {
  return user.first_name + (user.last_name ? ` ${user.last_name}` : "");
};
