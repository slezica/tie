{
  'targets': [{
    'target_name': 'peer',
    'sources': ['peer.cc'],
    'dependencies': ["<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except"],
    'conditions': [['OS!="mac"', {'type': 'none'}]],
  }],
}
