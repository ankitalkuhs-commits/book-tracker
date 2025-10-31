// src/components/bookpulse/WeeklyPulse.jsx
import React from "react";

// simple mock bar chart; later plug real data from /api/users/:id/weekly-pulse
const demo = [1,3,2,4,6,3,5]; // pages read or activity counts Mon->Sun
export default function WeeklyPulse(){
  const max = Math.max(...demo);
  return (
    <div style={{ display:"flex", gap:8, alignItems:"end", height:120 }}>
      {demo.map((v,i)=>(
        <div key={i} style={{ width:20, textAlign:"center" }}>
          <div style={{ height: (v/max)*100 + "%", background: ["#7c3aed","#ef4444","#f59e0b","#10b981","#3b82f6","#f97316","#6366f1"][i%7], borderRadius:6 }} />
          <div style={{ fontSize:11, marginTop:6, color:"#666" }} >{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</div>
        </div>
      ))}
    </div>
  )
}
