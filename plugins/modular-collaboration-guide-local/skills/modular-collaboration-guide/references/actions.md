# 档案接口

工具名以实际连接发现的本产品工具为准。collaboration_profile({}) 返回 {profile}；档案含 revision、methods、memories、tasks。collaboration_context({taskId?}) 返回适用背景。collaboration_export({}) 返回 {json, markdown}。

所有写入调用 collaboration_update({revision, action})。本地版使用当前机器的独立档案；云端版由登录决定身份；均不接受参数指定他人身份。一个动作一次原子写入；下一动作使用返回的新版本。

## 保存记忆

    {
      "revision": 0,
      "action": {
        "action": "memory.save",
        "value": {
          "key": "回答详细程度",
          "content": "用户偏好先给结论，再补充必要解释。",
          "kind": "preference",
          "scope": "global",
          "status": "active",
          "source": {
            "type": "user_statement",
            "excerpt": "我喜欢先看结论，再看解释。"
          }
        }
      }
    }

以上是参数示例，不是用户的真实偏好。可选 source.threadId。任务范围必须提供已存在的 taskId；临时要求自动限制为任务范围。原始来源摘录最多4000字符。

## 其他动作

- memory.edit：id, version, value；明确纠正冲突时加 correction: true。value 为完整条目值，不含版本、历史和冲突字段。
- memory.status：id, version, status，状态为 active|candidate|paused|disabled。冲突和未经确认的推测不能强制启用。
- memory.undo：id, version, targetVersion，恢复已存在的历史版本，重新检查适用性与冲突。
- memory.delete：id, version，删除条目及其版本记录。
- task.save：value: {id?, title, methodIds:[], memoryIds:[], automaticMemories:true}。空方法选择表示使用全部启用方法；automaticMemories:false 时只使用 memoryIds 中当前适用的启用条目。
- feedback：id 为方法标识，rating: useful|unhelpful。仅保存用户明确反馈。
- method.save：新增用 value；修改再带 id, version。值含 title, keywords:[], template, reason, missing:[], source:{label,url?}, enabled；模板用 {goal} 代表目标。公开来源链接为 HTTPS，自建方法明确标注。
- method.undo：id, version, targetVersion。
- method.delete：id, version。
- import：data 为本产品 JSON 导出，schemaVersion:1, methods:[], memories:[]；含任务记忆时加当前 taskId。用户预览确认后导入；所有导入记忆保持候选，重新生成标识，不覆盖本地条目。

首版单个档案最多1000条记忆、200个方法、200个任务；序列化容量上限约1MB。单次导入方法和记忆各最多100条。不要拆分恶意输入绕过容量限制。

出现版本冲突先重新读取；未经重新核对不重复删除。返回 isError:true 表示未完成，不能向用户声称已保存。
