import React from "react"
export default function PulseCard({post}){
  return(
  <div className="bg-white rounded shadow p-4 mb-4">
    <h3 className="font-semibold">{post.user?.name} felt {post.feeling} reading {post.book?.title}</h3>
    <p className="mt-2 text-gray-700 text-sm">{post.text}</p>
    {post.image && <img src={post.image} alt="" className="mt-3 rounded" />}
    <p className="text-xs text-gray-400 mt-2">{post.likes} ❤️  {post.comments} 💬  • {post.createdAt}</p>
  </div>)
}
