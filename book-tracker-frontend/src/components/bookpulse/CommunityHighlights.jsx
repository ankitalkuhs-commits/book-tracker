import React from "react"
export default function CommunityHighlights({data}){
  return (
  <div className="bg-white rounded shadow p-3">
    <h4 className="font-semibold mb-2">Community Highlights</h4>
    <div className="text-sm">
      <p className="font-medium">Top Emotional Books</p>
      <ul className="mb-2">{data?.topBooks?.map((b,i)=>
        <li key={i}>{b.title} <span className="text-xs bg-gray-100 rounded px-2 py-0.5 ml-2">{b.emotion}</span></li>)}</ul>
      <p className="font-medium">Most Expressive Readers</p>
      <ul>{data?.readers?.map((r,i)=><li key={i}>{r.handle}</li>)}</ul>
    </div>
  </div>)
}
