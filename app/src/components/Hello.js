import React from 'react';
import '../tailwind/tailwind.css';
import './Hello.css';

const Hello = (props) => {
	return (
		<div>
			<h1 className="no-select">{props.txt}</h1>
			<div className="button">
			<div className="box">K</div>
			<div className="box">L</div>
			<div className="box">O</div>
			<div className="box">B</div>
			<div className="box">O</div>
			<div className="box">X</div>
			</div>
		</div>
	);
};

export default Hello;