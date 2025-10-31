import React from "react"
export default function FollowersReading({list=[]}){
  return (
    <div className="bg-white rounded shadow p-3 mb-4">
      <h4 className="font-semibold mb-2">People you follow are reading</h4>
      {list.map(item=>(
        <div key={item.id} className="flex gap-2 mb-2">
          <img src={item.book.cover} className="w-10 h-14 object-cover rounded" alt=""/>
          <div>
            <div className="text-sm font-medium">{item.book.title}</div>
            <div className="text-xs text-gray-500">{item.user.name}</div>
            <div className="bg-gray-200 rounded-full h-2 w-32 mt-1">
              <div style={{width:item.progress+'%'}} className="bg-green-500 h-2 rounded-full"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
