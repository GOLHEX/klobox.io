import React, { Component } from 'react';
import Web3 from 'web3';

class Web extends Component {
  constructor(props) {
    super(props);
    this.state = {isConnected: false, peers: 0, version: ''};
    this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
  }

  componentWillMount() {
    if(this.web3 && this.web3.isConnected()) {
      this.setState({isConnected: true});
      if(this.web3.net.listening) {
        this.setState({peers: this.web3.net.peerCount});
      }
      this.setState({version: this.web3.version.node})
    }
  }

  render() {
    return (
      <div>
        <h2>Is connected?:</h2><br/> {this.state.isConnected?'Connected to local node':'Not Connected'}
        <br/>
        <br/>
        <h2>The number of peers:</h2><br/> {this.state.peers}
        <br/>
        <br/>
        <h2>Node info:</h2><br/> {this.state.version}
      </div>
    );
  }
}

export default Web;