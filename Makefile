distro=ubuntu
release=focal
service=base

instance_type=t2.small
build_ansible_master=true
tf_action=apply
tf_state=develop

define userdata
debug: true
disable_root: true
users:
  - name: ${USER}
	shell: /bin/bash
	ssh_authorized_keys:
	  - ${PUBLIC_KEY}
endef
export userdata

ifeq ($(service), base)
	packer_dir=packer/aws/base.pkr.hcl
else
	packer_dir=packer/aws
endif

generate-ci-data:
	@echo "Generating cloud-init data..."
	@echo "$$userdata" > ci-data/user-data
	@echo "Done"

tf-aws-infra:
	terraform $(tf_action) \
		--target=aws_internet_gateway.primary_igateway \
		--target=aws_vpc.primary_vpc \
		--target=aws_vpc.primary_vpc \
		--target=aws_default_security_group.allow_all \
		--target=aws_subnet.master_subnet \
		--target=aws_subnet.worker_subnet \
		--target=aws_default_route_table.primary_route_table \
		--target=aws_main_route_table_association.primary_subnet_association \
		--target=aws_main_route_table_association.secondary_subnet_association \
		-state=state/$(tf_state).tfstate

packer-aws:
	packer build \
		-force \
		-var 'distro=$(distro)' \
		-var 'release=$(release)' \
		-var 'type=$(instance_type)' \
		--only='amazon-ebs.$(distro)-$(service)' \
		$(packer_dir)
