export const demo = {
  posts: [
    { id:1, user:{name:"Ankit"}, feeling:"serene",
      text:"When you want something...", book:{title:"The Alchemist"}, image:"https://picsum.photos/400/200", likes:128, comments:12, createdAt:"2 h ago" },
  ],
  followersReading: [
    { id:10, user:{name:"Chloe"}, book:{title:"Dune",cover:"https://picsum.photos/80/120"}, progress:75 },
  ],
  highlights: {
    topBooks:[{title:"The Song of Achilles",emotion:"Sadness"}],
    readers:[{handle:"@marcoreads"},{handle:"@bookish_jane"}]
  }
}

export const fetchPosts = ()=>Promise.resolve(demo.posts)
export const fetchFollowersReading = ()=>Promise.resolve(demo.followersReading)
export const fetchHighlights = ()=>Promise.resolve(demo.highlights)
