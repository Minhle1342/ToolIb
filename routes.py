# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request, current_app
# pyrefly: ignore [missing-import]
import flask
from models import db, Project, View, Image
import os
import utils
from inference import YOLOInference

# Initialize Inference Engine
# Assuming the user places the model in 'models/yolov12s.onnx' or we ask for path.
# For now, hardcode relative path 'models/yolo12s.onnx' in the CWD
MODEL_PATH = os.path.join(os.getcwd(), 'models', 'yolo12s.onnx')
inference_engine = YOLOInference(MODEL_PATH)

api_bp = Blueprint('api', __name__)

# --- Projects ---
@api_bp.route('/projects', methods=['GET'])
def get_projects():
    projects = Project.query.all()
    return jsonify([p.to_dict() for p in projects])

@api_bp.route('/projects', methods=['POST'])
def create_project():
    data = request.json
    try:
        new_project = Project(
            name=data['name'],
            root_path=data['root_path'],
            classes_path=data['classes_path']
        )
        db.session.add(new_project)
        db.session.commit()
        
        # Tự động quét và đồng bộ ảnh từ thư mục ngay khi tạo project
        try:
            utils.scan_and_sync_images(new_project)
        except Exception as scan_err:
            print(f"Error during auto-scanning: {scan_err}")
            
        return jsonify(new_project.to_dict()), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.json
    try:
        path_changed = False
        if 'name' in data:
            project.name = data['name']
        if 'classes_path' in data:
            project.classes_path = data['classes_path']
        if 'root_path' in data and data['root_path'] != project.root_path:
            project.root_path = data['root_path']
            path_changed = True
            
        if path_changed:
            project.images.clear()
            project.views.clear()
            
        db.session.commit()
        
        if path_changed:
            try:
                utils.scan_and_sync_images(project)
            except Exception as scan_err:
                print(f"Error during auto-scanning in update: {scan_err}")
                
        return jsonify(project.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@api_bp.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    try:
        db.session.delete(project)
        db.session.commit()
        return jsonify({'message': 'Project deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@api_bp.route('/projects/scan/<int:project_id>', methods=['POST'])
def scan_project(project_id):
    project = Project.query.get_or_404(project_id)
    added_count = utils.scan_and_sync_images(project)
    return jsonify({'message': f'Scanned and synced. Added {added_count} new images.'})

# --- Uploads for Drag-and-Drop Project Creation ---
ALLOWED_UPLOAD_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.txt', '.JPG', '.JPEG', '.PNG', '.BMP'}

@api_bp.route('/upload-folder', methods=['POST'])
def upload_folder():
    project_name = request.form.get('project_name', 'default_project')
    # Clean project name for a safe folder name
    safe_project_name = "".join([c for c in project_name if c.isalnum() or c in (' ', '_')]).strip()
    safe_project_name = safe_project_name.replace(' ', '_')
    if not safe_project_name:
        safe_project_name = 'default_project'
        
    upload_dir = os.path.abspath(os.path.join('uploads', safe_project_name, 'images'))
    os.makedirs(upload_dir, exist_ok=True)
    
    files = request.files.getlist('files')
    saved_count = 0
    for file in files:
        if file.filename:
            basename = os.path.basename(file.filename)
            ext = os.path.splitext(basename)[1].lower()
            if ext in {'.jpg', '.jpeg', '.png', '.bmp', '.txt'}:
                dest_path = os.path.join(upload_dir, basename)
                file.save(dest_path)
                saved_count += 1
                
    return jsonify({
        'status': 'success',
        'absolute_path': upload_dir,
        'count': saved_count
    })

@api_bp.route('/upload-file', methods=['POST'])
def upload_file():
    project_name = request.form.get('project_name', 'default_project')
    safe_project_name = "".join([c for c in project_name if c.isalnum() or c in (' ', '_')]).strip()
    safe_project_name = safe_project_name.replace(' ', '_')
    if not safe_project_name:
        safe_project_name = 'default_project'
        
    upload_dir = os.path.abspath(os.path.join('uploads', safe_project_name))
    os.makedirs(upload_dir, exist_ok=True)
    
    file = request.files.get('file')
    if file and file.filename:
        dest_path = os.path.join(upload_dir, 'classes.txt')
        file.save(dest_path)
        return jsonify({
            'status': 'success',
            'absolute_path': dest_path
        })
        
    return jsonify({'error': 'No file uploaded'}), 400


# --- Views ---
@api_bp.route('/views', methods=['POST'])
def create_view():
    data = request.json
    new_view = View(name=data['name'], project_id=data['project_id'])
    db.session.add(new_view)
    db.session.commit()
    return jsonify(new_view.to_dict()), 201

@api_bp.route('/views/assign', methods=['POST'])
def assign_view():
    # Logic to assign images to a view
    # data: { view_id, count, strategy='random'|'sequential', ... }
    data = request.json
    count = utils.assign_images_to_view(data['view_id'], data.get('count', 0), data.get('project_id'))
    return jsonify({'message': f'Assigned {count} images to view.'})

# --- Images & Labels ---
@api_bp.route('/images', methods=['GET'])
def get_images():
    project_id = request.args.get('project_id')
    view_id = request.args.get('view_id')
    flag_status = request.args.get('flag_status')
    
    query = Image.query
    if project_id:
        query = query.filter_by(project_id=project_id)
    if view_id:
        query = query.filter_by(view_id=view_id)
    if flag_status:
        query = query.filter_by(flag_status=flag_status)
    
    # Pagination could be added here
    images = query.all()
    result = []
    for img in images:
        d = img.to_dict()
        d['classes'] = utils.get_image_classes(img)
        result.append(d)
    return jsonify(result)

@api_bp.route('/labels/<int:image_id>', methods=['GET'])
def get_label(image_id):
    image = Image.query.get_or_404(image_id)
    labels = utils.read_yolo_label(image)
    return jsonify(labels)

@api_bp.route('/save', methods=['POST'])
def save_label():
    data = request.json
    # data: { image_id, labels: [...], flag_status }
    image = Image.query.get_or_404(data['image_id'])
    utils.save_yolo_label(image, data['labels'])
    
    image.is_labeled = True
    if 'flag_status' in data:
        image.flag_status = data['flag_status']
    
    db.session.commit()
    return jsonify({'message': 'Saved successfully'})

@api_bp.route('/image_data/<int:image_id>')
def serve_image(image_id):
    image = Image.query.get_or_404(image_id)
    project = Project.query.get(image.project_id)
    # Check if absolute path
    return flask.send_from_directory(project.root_path, image.filename)

@api_bp.route('/projects/<int:project_id>/classes')
def get_project_classes(project_id):
    project = Project.query.get_or_404(project_id)
    classes = utils.get_classes(project)
    return jsonify(classes)

# --- Export ---
@api_bp.route('/export', methods=['POST'])
def export_dataset():
    data = request.json
    # Support multiple criteria types
    criteria = {}
    if 'project_ids' in data:
        criteria['project_ids'] = data['project_ids']
    if 'view_id' in data:
        criteria['view_id'] = data['view_id']
    if 'image_ids' in data:
        criteria['image_ids'] = data['image_ids']
    
    if 'exclude_flagged' in data:
        criteria['exclude_flagged'] = data['exclude_flagged']
        
    # Default to 'yolo' if not specified
    export_fmt = data.get('format', 'yolo')
        
    result = utils.export_dataset(criteria, data.get('split_ratio', 0.8), format=export_fmt)
    return jsonify(result)

@api_bp.route('/autolabel/<int:image_id>', methods=['POST'])
def auto_label(image_id):
    image = Image.query.get_or_404(image_id)
    project = Project.query.get(image.project_id)
    
    # Construct full image path
    image_path = os.path.join(project.root_path, image.filename)
    
    result = inference_engine.predict(image_path)
    
    if 'error' in result:
        return jsonify(result), 400
        
    return jsonify(result)
