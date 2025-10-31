import React,{useState} from "react"
export default function PostComposer({onPost}){
  const [text,setText]=useState("")
  return (
    <div className="p-4 bg-white rounded shadow mb-4">
      <textarea className="w-full border rounded p-2" rows="3"
        placeholder="What are you feeling from your read?"
        value={text} onChange={e=>setText(e.target.value)} />
      <button onClick={()=>{ if(!text) return; onPost({text,createdAt:"just now"}); setText("") }}
        className="mt-2 px-4 py-1 bg-indigo-500 text-white rounded">Share Pulse</button>
    </div>
  )
}
